package com.aria.fleet.repository;

import com.aria.fleet.model.ContractDebt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ContractDebtRepository extends JpaRepository<ContractDebt, UUID> {
    List<ContractDebt> findByReconciledAtIsNull();
}
